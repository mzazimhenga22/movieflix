// Type shims for Deno/Supabase Edge functions so VS Code stops flagging errors.

declare namespace Deno {
  function env(): never;
  // Minimal subset needed for env access in edge functions
  namespace env {
    function get(key: string): string | undefined;
  }
}

declare module 'https://deno.land/std@0.168.0/http/server.ts' {
  export function serve(handler: (req: Request) => Response | Promise<Response>): void | Promise<void>;
}

declare module 'npm:jose@5.9.6' {
  export * from 'jose';
}

declare module 'npm:firebase-admin/app' {
  export * from 'firebase-admin/app';
}

declare module 'npm:firebase-admin/firestore' {
  export * from 'firebase-admin/firestore';
}
