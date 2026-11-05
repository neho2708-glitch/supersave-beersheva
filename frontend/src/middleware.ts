import { NextResponse, type NextRequest } from "next/server";

/**
 * HTTP Basic protection for the admin area. The password is ADMIN_TOKEN (any username).
 * With no token set it is open in development and disabled in production.
 */
export function middleware(request: NextRequest) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("Admin is disabled: ADMIN_TOKEN is not set.", { status: 503 });
    }
    return NextResponse.next();
  }
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    if (decoded.slice(decoded.indexOf(":") + 1) === token) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="SuperSave admin"' },
  });
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] };
