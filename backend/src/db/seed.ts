import { v4 as uuidv4 } from 'uuid';
import readline from 'node:readline';
import { getDatabase } from './connection.js';
import { hashPassword } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Write the question, then mute output for the password
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }

    let password = '';
    const onData = (char: Buffer) => {
      const c = char.toString('utf8');

      if (c === '\n' || c === '\r' || c === '\u0004') {
        if (stdin.isTTY) {
          stdin.setRawMode(wasRaw ?? false);
        }
        stdin.removeListener('data', onData);
        rl.close();
        process.stdout.write('\n');
        resolve(password);
      } else if (c === '\u0003') {
        // Ctrl+C
        process.exit(1);
      } else if (c === '\u007F' || c === '\b') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += c;
        process.stdout.write('*');
      }
    };

    stdin.on('data', onData);
    stdin.resume();
  });
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY);
}

export async function seedDefaultAdmin(): Promise<void> {
  const db = getDatabase();

  // Check if any user exists at all
  const existingUser = await db
    .selectFrom('app_user')
    .selectAll()
    .executeTakeFirst();

  if (existingUser) {
    return;
  }

  // First run: no users exist. Collect admin credentials.
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║       CycloneDX Assessors Studio — First Run        ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  No users found. Create an administrator account.   ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  let username: string;
  let email: string;
  let displayName: string;
  let password: string;

  if (isInteractive()) {
    // Interactive terminal: prompt the user
    username = await prompt('  Username: ');
    if (!username || username.length < 3) {
      console.error('  Username must be at least 3 characters.');
      process.exit(1);
    }

    email = await prompt('  Email: ');
    if (!email || !email.includes('@')) {
      console.error('  A valid email address is required.');
      process.exit(1);
    }

    displayName = await prompt('  Display name: ');
    if (!displayName) {
      displayName = username;
    }

    password = await promptHidden('  Password: ');
    if (!password || password.length < 8) {
      console.error('  Password must be at least 8 characters.');
      process.exit(1);
    }

    const confirm = await promptHidden('  Confirm password: ');
    if (password !== confirm) {
      console.error('  Passwords do not match.');
      process.exit(1);
    }
  } else {
    // Non-interactive (CI, Docker, etc.): require environment variables
    username = process.env.ADMIN_USERNAME || '';
    email = process.env.ADMIN_EMAIL || '';
    displayName = process.env.ADMIN_DISPLAY_NAME || username;
    password = process.env.ADMIN_PASSWORD || '';

    if (!username || !email || !password) {
      console.error('');
      console.error('  Non-interactive environment detected.');
      console.error('  Set ADMIN_USERNAME, ADMIN_EMAIL, and ADMIN_PASSWORD');
      console.error('  environment variables to create the initial admin user.');
      console.error('');
      process.exit(1);
    }

    if (password.length < 8) {
      console.error('  ADMIN_PASSWORD must be at least 8 characters.');
      process.exit(1);
    }
  }

  const passwordHash = await hashPassword(password);

  await db
    .insertInto('app_user')
    .values({
      id: uuidv4(),
      username,
      email,
      password_hash: passwordHash,
      display_name: displayName,
      role: 'admin',
      is_active: true,
    })
    .execute();

  console.log('');
  console.log(`  Admin account "${username}" created successfully.`);
  console.log('');

  logger.info('Initial admin user created', { username, email });
}

const DEFAULT_PERMISSIONS = [
  // Projects
  { key: 'projects.view', name: 'View Projects', description: 'View project list and details', category: 'projects' },
  { key: 'projects.create', name: 'Create Projects', description: 'Create new projects', category: 'projects' },
  { key: 'projects.edit', name: 'Edit Projects', description: 'Edit existing projects', category: 'projects' },
  { key: 'projects.delete', name: 'Delete Projects', description: 'Delete or retire projects', category: 'projects' },
  // Standards
  { key: 'standards.view', name: 'View Standards', description: 'View standards and requirements', category: 'standards' },
  { key: 'standards.import', name: 'Import Standards', description: 'Import standards from CycloneDX feed', category: 'standards' },
  { key: 'standards.create', name: 'Create Standards', description: 'Create new draft standards', category: 'standards' },
  { key: 'standards.edit', name: 'Edit Standards', description: 'Edit draft standards', category: 'standards' },
  { key: 'standards.submit', name: 'Submit Standards', description: 'Submit standards for approval', category: 'standards' },
  { key: 'standards.approve', name: 'Approve Standards', description: 'Approve or reject submitted standards', category: 'standards' },
  { key: 'standards.duplicate', name: 'Duplicate Standards', description: 'Duplicate an existing standard to create a new version', category: 'standards' },
  // Requirements
  { key: 'requirements.edit', name: 'Edit Requirements', description: 'Edit standard requirement definitions', category: 'requirements' },
  // Assessments
  { key: 'assessments.view', name: 'View Assessments', description: 'View assessment list and details', category: 'assessments' },
  { key: 'assessments.create', name: 'Create Assessments', description: 'Create new assessments', category: 'assessments' },
  { key: 'assessments.edit', name: 'Edit Assessments', description: 'Edit assessments', category: 'assessments' },
  { key: 'assessments.manage', name: 'Manage Assessments', description: 'Start, complete, and manage assessment lifecycle', category: 'assessments' },
  { key: 'assessments.notes', name: 'Work Notes', description: 'Add work notes to assessment requirements', category: 'assessments' },
  // Evidence
  { key: 'evidence.view', name: 'View Evidence', description: 'View evidence items', category: 'evidence' },
  { key: 'evidence.create', name: 'Create Evidence', description: 'Create new evidence', category: 'evidence' },
  { key: 'evidence.edit', name: 'Edit Evidence', description: 'Edit evidence items', category: 'evidence' },
  { key: 'evidence.review', name: 'Review Evidence', description: 'Review and approve evidence', category: 'evidence' },
  { key: 'evidence.submit', name: 'Submit Evidence', description: 'Submit evidence for review', category: 'evidence' },
  { key: 'evidence.delete', name: 'Delete Evidence', description: 'Delete or expire evidence', category: 'evidence' },
  // Claims
  { key: 'claims.view', name: 'View Claims', description: 'View claims', category: 'claims' },
  { key: 'claims.create', name: 'Create Claims', description: 'Create new claims', category: 'claims' },
  { key: 'claims.edit', name: 'Edit Claims', description: 'Edit claims', category: 'claims' },
  // Attestations
  { key: 'attestations.view', name: 'View Attestations', description: 'View attestations', category: 'attestations' },
  { key: 'attestations.create', name: 'Create Attestations', description: 'Create attestations', category: 'attestations' },
  { key: 'attestations.sign', name: 'Sign Attestations', description: 'Sign attestations as signatory', category: 'attestations' },
  // Export
  { key: 'export.pdf', name: 'Export PDF', description: 'Export assessment reports as PDF', category: 'export' },
  { key: 'export.cyclonedx', name: 'Export CycloneDX', description: 'Export CycloneDX BOM documents', category: 'export' },
  // Entities
  { key: 'entities.view', name: 'View Entities', description: 'View entity list and details', category: 'entities' },
  { key: 'entities.create', name: 'Create Entities', description: 'Create new entities', category: 'entities' },
  { key: 'entities.edit', name: 'Edit Entities', description: 'Edit existing entities', category: 'entities' },
  { key: 'entities.delete', name: 'Delete Entities', description: 'Delete entities', category: 'entities' },
  // Admin
  { key: 'admin.users', name: 'Manage Users', description: 'Create, edit, and manage user accounts', category: 'admin' },
  { key: 'admin.roles', name: 'Manage Roles', description: 'Create, edit, and manage roles and permissions', category: 'admin' },
  { key: 'admin.settings', name: 'Manage Settings', description: 'Manage application settings', category: 'admin' },
  { key: 'admin.webhooks', name: 'Manage Webhooks', description: 'Create, edit, and manage webhooks', category: 'admin' },
  { key: 'admin.integrations', name: 'Manage Integrations', description: 'Manage chat and external integrations', category: 'admin' },
  { key: 'admin.encryption', name: 'Manage Encryption', description: 'Manage encryption keys and settings', category: 'admin' },
  { key: 'admin.notification_rules', name: 'Manage Notification Rules', description: 'Manage global notification rules', category: 'admin' },
  { key: 'admin.tags', name: 'Manage Tags', description: 'Create, edit, and manage tags', category: 'admin' },
  { key: 'admin.import', name: 'Import Data', description: 'Import CycloneDX attestation documents', category: 'admin' },
  { key: 'admin.audit', name: 'View Audit Logs', description: 'View system audit logs', category: 'admin' },
];

const DEFAULT_ROLES = [
  {
    key: 'admin',
    name: 'Administrator',
    description: 'Full access to all features and settings',
    permissions: DEFAULT_PERMISSIONS.map(p => p.key),
  },
  {
    key: 'assessor',
    name: 'Assessor',
    description: 'Can conduct assessments, manage evidence, create claims and attestations',
    permissions: [
      'projects.view', 'standards.view', 'entities.view',
      'assessments.view', 'assessments.create', 'assessments.edit', 'assessments.manage', 'assessments.notes',
      'evidence.view', 'evidence.create', 'evidence.edit', 'evidence.review',
      'claims.view', 'claims.create', 'claims.edit',
      'attestations.view', 'attestations.create', 'attestations.sign',
      'export.pdf', 'export.cyclonedx',
    ],
  },
  {
    key: 'assessee',
    name: 'Assessee',
    description: 'Can view assessments, submit evidence, and view attestations',
    permissions: [
      'projects.view', 'standards.view', 'entities.view',
      'assessments.view', 'assessments.notes',
      'evidence.view', 'evidence.create', 'evidence.submit',
      'claims.view',
      'attestations.view',
    ],
  },
  {
    key: 'standards_manager',
    name: 'Standards Manager',
    description: 'Can author, edit, and submit draft standards for approval',
    is_system: true,
    permissions: [
      'standards.view', 'standards.create', 'standards.edit', 'standards.submit', 'standards.duplicate',
    ],
  },
  {
    key: 'standards_approver',
    name: 'Standards Approver',
    description: 'Can approve or reject submitted standards',
    is_system: true,
    permissions: [
      'standards.view', 'standards.approve',
    ],
  },
];

export async function seedDefaultRolesAndPermissions(): Promise<void> {
  const db = getDatabase();

  // Check if permissions already exist
  const existingPerms = await db
    .selectFrom('permission')
    .select(db.fn.count<number>('id').as('count'))
    .executeTakeFirstOrThrow();

  if (Number(existingPerms.count) > 0) {
    logger.info('Permissions already seeded, skipping');
    return;
  }

  logger.info('Seeding default permissions and roles...');

  // Insert permissions
  const permissionMap = new Map<string, string>();
  for (const perm of DEFAULT_PERMISSIONS) {
    const id = uuidv4();
    await db
      .insertInto('permission')
      .values({
        id,
        key: perm.key,
        name: perm.name,
        description: perm.description,
        category: perm.category,
      })
      .execute();
    permissionMap.set(perm.key, id);
  }

  // Insert roles and role_permission associations
  for (const role of DEFAULT_ROLES) {
    const roleId = uuidv4();
    await db
      .insertInto('role')
      .values({
        id: roleId,
        key: role.key,
        name: role.name,
        description: role.description,
        is_system: true,
      })
      .execute();

    for (const permKey of role.permissions) {
      const permId = permissionMap.get(permKey);
      if (permId) {
        await db
          .insertInto('role_permission')
          .values({
            role_id: roleId,
            permission_id: permId,
            created_at: new Date(),
          })
          .execute();
      }
    }
  }

  logger.info('Default permissions and roles seeded successfully');
}
