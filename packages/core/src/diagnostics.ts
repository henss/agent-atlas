export type DiagnosticLevel = 'error' | 'warning' | 'info';

export interface AtlasDiagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
  hint?: string;
  entityId?: string;
  path?: string;
}

export function hasErrors(diagnostics: AtlasDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.level === 'error');
}
