export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = 'app_error',
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class Unauthorized extends AppError {
  constructor(message = 'You must sign in to do this') {
    super(401, message, 'unauthorized');
  }
}

export class Forbidden extends AppError {
  constructor(message = 'Your role is not allowed to do this') {
    super(403, message, 'forbidden');
  }
}

export class NotFound extends AppError {
  constructor(message = 'Not found') {
    super(404, message, 'not_found');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code = 'validation_failed') {
    super(422, message, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'conflict') {
    super(409, message, code);
  }
}
