// Local TypeScript verification. Supabase supplies Deno at runtime.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};
declare module "npm:@supabase/supabase-js@2" {
  export { createClient } from "@supabase/supabase-js";
}
