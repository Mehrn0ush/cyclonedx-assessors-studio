import winston from 'winston';
import { getConfig } from '../config/index.js';

const config = getConfig();

// Sensitive fields to redact
const SENSITIVE_FIELDS = ['password', 'token', 'authorization', 'cookie', 'secret'];

function redactSensitiveData(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }

  const result = { ...(obj as Record<string, unknown>) };

  for (const key in result) {
    if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field))) {
      result[key] = '[REDACTED]';
    } else if (typeof result[key] === 'object' && result[key] !== null) {
      result[key] = redactSensitiveData(result[key]);
    }
  }

  return result;
}

export const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf((info: Record<string, unknown>) => {
      const timestamp = info.timestamp;
      const level = info.level;
      const message = info.message;
      const requestId = info.requestId;
      const meta: Record<string, unknown> = {};
      for (const key in info) {
        if (key !== 'timestamp' && key !== 'level' && key !== 'message' && key !== 'requestId') {
          meta[key] = info[key];
        }
      }

      const result: Record<string, unknown> = {
        timestamp,
        level,
        message,
      };
      if (requestId) result.requestId = requestId;
      const redacted = redactSensitiveData(meta);
      if (typeof redacted === 'object' && redacted !== null && !Array.isArray(redacted)) {
        Object.assign(result, redacted);
      }
      return JSON.stringify(result);
    })
  ),
  transports: [new winston.transports.Console()],
});

export default logger;
