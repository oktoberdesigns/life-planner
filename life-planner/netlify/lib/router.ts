import { HttpError } from "./auth";

export interface Ctx {
  req: Request;
  url: URL;
  params: Record<string, string>;
  owner: boolean;
  json<T = any>(): Promise<T>;
}
type Handler = (c: Ctx) => Promise<unknown> | unknown;
interface Route { method: string; regex: RegExp; keys: string[]; handler: Handler; auth: boolean }

export class Router {
  routes: Route[] = [];
  add(method: string, pattern: string, handler: Handler, auth = true) {
    const keys: string[] = [];
    const regex = new RegExp("^" + pattern.replace(/:([a-zA-Z_]+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "/?$");
    this.routes.push({ method, regex, keys, handler, auth });
  }
  get = (p: string, h: Handler, auth = true) => this.add("GET", p, h, auth);
  post = (p: string, h: Handler, auth = true) => this.add("POST", p, h, auth);
  patch = (p: string, h: Handler, auth = true) => this.add("PATCH", p, h, auth);
  put = (p: string, h: Handler, auth = true) => this.add("PUT", p, h, auth);
  del = (p: string, h: Handler, auth = true) => this.add("DELETE", p, h, auth);

  async handle(req: Request, owner: boolean): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api/, "") || "/";
    try {
      for (const r of this.routes) {
        if (r.method !== req.method) continue;
        const m = path.match(r.regex);
        if (!m) continue;
        if (r.auth && !owner) throw new HttpError(401, "Not signed in");
        if (req.method !== "GET" && req.headers.get("x-lp") !== "1") throw new HttpError(403, "Bad request");
        const params: Record<string, string> = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        let cached: any;
        const ctx: Ctx = {
          req, url, params, owner,
          json: async () => (cached ??= await req.json().catch(() => ({}))),
        };
        const out = await r.handler(ctx);
        if (out instanceof Response) return out;
        return Response.json(out ?? { ok: true });
      }
      return Response.json({ error: "Not found" }, { status: 404 });
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: "Something went wrong" }, { status: 500 });
    }
  }
}
