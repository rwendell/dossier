declare module '@jsonresume/schema' {
  interface ValidationError {
    property?: string;
    message?: string;
    [key: string]: unknown;
  }

  const schema: {
    validate(
      resume: unknown,
      callback: (errors: ValidationError[] | null, valid: boolean) => void,
    ): void;
  };

  export default schema;
}
