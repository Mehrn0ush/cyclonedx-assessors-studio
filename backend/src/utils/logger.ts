import winston from 'winston';
import { getConfig } from '../config/index.js';

const config = getConfig();

// Sensitive fields to redact
const SENSITIVE_FIELDS = ['password', 'token', 'authorization', 'cookie', 'secret'];

function redactSensitiveData(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }

  const result = { ...obj };

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
    winston.format.printf((info: any) => {
      const { timestamp, level, message, requestId, ...meta } = info;

      return JSON.stringify({
        timestamp,
        level,
        message,
        ...(requestId && { requestId }),
        ...redactSensitiveData(meta),
      });
    })
  ),
  transports: [new winston.transports.Console()],
});

export default logger;
