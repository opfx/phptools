import { JsonObject } from './../../types';

export interface LoggerMetadata extends JsonObject {
  name: string;
  path: string[];
}
export interface LogEntry extends LoggerMetadata {
  level: LogLevel;
  message: string;
  timestamp: number;
}
export interface LoggerApi {
  createChild(name: string): LoggerApi;
  log(level: LogLevel, message: string, metadata?: JsonObject): void;
  debug(message: string, metadata?: JsonObject): void;
  info(message: string, metadata?: JsonObject): void;
  warn(message: string, metadata?: JsonObject): void;
  error(message: string, metadata?: JsonObject): void;
  fatal(message: string, metadata?: JsonObject): void;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
