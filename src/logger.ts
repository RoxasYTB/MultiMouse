const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export class Logger {
  private static instance: Logger;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public info(message: string): void {
    if (!IS_PRODUCTION) {
    }
  }

  public warn(message: string): void {
    console.warn(`⚠️ ${message}`);
  }

  public error(message: string, error?: any): void {
    if (error) {
      console.error(`❌ ${message}`, error);
    } else {
      console.error(`❌ ${message}`);
    }
  }

  public success(message: string): void {
    if (!IS_PRODUCTION) {
    }
  }

  public debug(message: string, data?: any): void {
    if (!IS_PRODUCTION) {
      if (data) {
      } else {
      }
    }
  }
}

export const logger = Logger.getInstance();

