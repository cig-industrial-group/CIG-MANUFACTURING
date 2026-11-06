/**
 * ============================================================================
 * PROYECTO: CIG.MANUFACTURING
 * COPYRIGHT: © 2026 Emmanuel Caballero De La Rosa. Todos los derechos reservados.
 * UBICACIÓN: Tijuana, Baja California, México
 * LICENCIA: Propietaria y Confidencial. Uso no autorizado estrictamente prohibido.
 * CONTACTO: caballeroemanuel966@gmail.com
 * ============================================================================
 */

/**
 * Declaración ambiental MÍNIMA de «bun:sqlite» para los scripts de
 * operación (migración de datos y prueba de humo Fase 6), que leen el
 * archivo .db legajo con el módulo nativo del runtime Bun.
 *
 * ¿Por qué una declaración local y no `/// <reference types="bun-types" />`?
 * La referencia global arrastra TODOS los globales de Bun y cambia la
 * resolución de tipos estándar (p. ej. ReadableStream) en el código de
 * la aplicación; esta declaración aisla el efecto a exactamente la
 * superficie que los scripts usan (Database/Statement/SQLQueryBindings),
 * sin tocar el grafo de tipos de src/.
 *
 * La superficie refleca la API documentada de bun:sqlite (readonly open,
 * prepare + all/get/run, close).
 */
declare module "bun:sqlite" {
  /** Valores enlazables en una sentencia preparada. */
  export type SQLQueryBindings =
    | null
    | undefined
    | string
    | number
    | bigint
    | boolean
    | ArrayBuffer
    | SharedArrayBuffer
    | Uint8Array
    | Date;

  export interface StatementResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  export class Statement {
    all(...params: SQLQueryBindings[]): unknown[];
    get(...params: SQLQueryBindings[]): unknown;
    run(...params: SQLQueryBindings[]): StatementResult;
  }

  export class Database {
    constructor(
      filename: string,
      options?: { readonly?: boolean; create?: boolean; fileMustExist?: boolean },
    );
    prepare(sql: string): Statement;
    run(sql: string): StatementResult;
    close(): void;
  }
}
