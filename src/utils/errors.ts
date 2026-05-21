export class JellyError extends Error {
  code: string;

  constructor(message: string, code: string = 'JELLY_ERROR') {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'JellyError';
    this.code = code;
  }
}

export class ValidationError extends JellyError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class UserCancelError extends JellyError {
  constructor(message: string) {
    super(message, 'USER_CANCELLED');
    this.name = 'UserCancelError';
  }
}
