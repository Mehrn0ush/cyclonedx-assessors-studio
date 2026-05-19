import { test, expect } from '../../fixtures/index.js';
import { uniqueEvidenceName } from '../../helpers/data.js';

/**
 * Evidence attachment upload validation.
 *
 * Reference (backend/src/routes/evidence.ts POST /:id/attachments):
 *   - Two upload modes: JSON body (base64) and multipart form data.
 *   - DEFAULT_ALLOWED_MIME_TYPES allowlist with magic-number sniff.
 *   - BLOCKED_MIME_TYPES list refuses text/html, javascript, svg+xml
 *     even when client-declared MIME matches the allowlist.
 *   - 413 on oversize, 415 on rejected MIME.
 *
 * The JSON-body branch is easier to drive from Playwright because no
 * busboy / form-data wiring is needed. The size and MIME guards apply
 * to both branches.
 */

function pngBase64(): string {
  // Minimal 1x1 transparent PNG. Real PNG magic header so the sniffer
  // approves it.
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=';
}

function htmlBase64(): string {
  return Buffer.from('<html><script>alert(1)</script></html>', 'utf-8').toString('base64');
}

function jsBase64(): string {
  return Buffer.from('console.log("xss")', 'utf-8').toString('base64');
}

async function createEvidence(api: Awaited<ReturnType<typeof import('@playwright/test').request.newContext>>): Promise<string> {
  const r = await api.post('/api/v1/evidence', {
    data: { name: uniqueEvidenceName(), description: 'upload test', state: 'in_progress' },
  });
  expect(r.ok(), `create evidence failed: ${await r.text()}`).toBeTruthy();
  const body = await r.json();
  return body.id as string;
}

test.describe('Evidence file upload validation @regression', () => {
  test('accepts a valid PNG via JSON body upload', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const id = await createEvidence(api);
    const r = await api.post(`/api/v1/evidence/${id}/attachments`, {
      data: {
        filename: 'pixel.png',
        contentType: 'image/png',
        binaryContent: pngBase64(),
      },
    });
    expect(r.status()).toBe(201);
    const body = await r.json();
    expect(body.attachments?.[0]?.contentType).toBe('image/png');
  });

  test('rejects HTML upload (blocked MIME)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const id = await createEvidence(api);
    const r = await api.post(`/api/v1/evidence/${id}/attachments`, {
      data: {
        filename: 'evil.html',
        contentType: 'text/html',
        binaryContent: htmlBase64(),
      },
    });
    expect(r.status()).toBe(415);
  });

  test('rejects JavaScript upload (blocked MIME)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const id = await createEvidence(api);
    const r = await api.post(`/api/v1/evidence/${id}/attachments`, {
      data: {
        filename: 'payload.js',
        contentType: 'application/javascript',
        binaryContent: jsBase64(),
      },
    });
    expect(r.status()).toBe(415);
  });

  test('rejects content-type spoofing (declared png, body is html)', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const id = await createEvidence(api);
    const r = await api.post(`/api/v1/evidence/${id}/attachments`, {
      data: {
        filename: 'fake.png',
        contentType: 'image/png',
        binaryContent: htmlBase64(),
      },
    });
    // Magic-number sniff should disagree with the declared png type and
    // either reject (415) or resolve to a safe text/* type that still
    // passes the allowlist. Either way, NOT 201 with image/png.
    if (r.status() === 201) {
      const body = await r.json();
      expect(body.attachments[0].contentType).not.toBe('image/png');
    } else {
      expect(r.status()).toBe(415);
    }
  });

  test('rejects oversize uploads with 413', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const id = await createEvidence(api);
    // 50 MB of zeros. Larger than the default max (configured via env).
    const huge = Buffer.alloc(50 * 1024 * 1024).toString('base64');
    const r = await api.post(`/api/v1/evidence/${id}/attachments`, {
      data: {
        filename: 'big.bin',
        contentType: 'application/octet-stream',
        binaryContent: huge,
      },
    });
    // 413 is the contract. Accept 400 too in case the dev environment
    // is configured with a higher cap and the upload is bouncing off
    // the busboy field-size limit instead.
    expect([400, 413]).toContain(r.status());
  });

  test('accepts a PDF upload', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const id = await createEvidence(api);
    const pdf = Buffer.from('%PDF-1.4\n%E2E\n%%EOF\n', 'binary').toString('base64');
    const r = await api.post(`/api/v1/evidence/${id}/attachments`, {
      data: {
        filename: 'doc.pdf',
        contentType: 'application/pdf',
        binaryContent: pdf,
      },
    });
    expect(r.status()).toBe(201);
  });

  test('preserves the uploaded filename verbatim on the attachment row', async ({ apiAs }) => {
    const api = await apiAs('admin');
    const id = await createEvidence(api);
    const r = await api.post(`/api/v1/evidence/${id}/attachments`, {
      data: {
        filename: 'report-final-v2.png',
        contentType: 'image/png',
        binaryContent: pngBase64(),
      },
    });
    expect(r.status()).toBe(201);
    const body = await r.json();
    expect(body.attachments[0].filename).toBe('report-final-v2.png');
  });
});
