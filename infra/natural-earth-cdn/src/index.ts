// deterrent only (Origin/Referer are spoofable), not a real auth boundary 
const ALLOWED_ORIGINS = new Set([
	"https://where.name", // prod
	"https://luis.earth", // prod
	"http://localhost:3000", // dev
]);

const VALID_KEYS = new Set([
	"110m/cultural/ne_110m_admin_0_countries.geojson",
	"110m/cultural/ne_110m_admin_0_countries_lakes.geojson",
	"50m/cultural/ne_50m_admin_0_countries.geojson",
	"50m/cultural/ne_50m_admin_0_countries_lakes.geojson",
	"10m/cultural/ne_10m_admin_0_countries.geojson",
	"10m/cultural/ne_10m_admin_0_countries_lakes.geojson",
]);

function corsOrigin(request: Request): string | null {
	const origin = request.headers.get("Origin") ?? request.headers.get("Referer");
	if (!origin) return null;
	const host = new URL(origin).origin;
	return ALLOWED_ORIGINS.has(host) ? host : null;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const allowedOrigin = corsOrigin(request);
		if (!allowedOrigin) {
			return new Response("Forbidden", { status: 403 });
		}

		const key = new URL(request.url).pathname.slice(1); // strip leading "/"
		if (!VALID_KEYS.has(key)) {
			return new Response("Not Found", { status: 404 });
		}

		const object = await env.NATURAL_EARTH.get(key);
		if (!object) {
			return new Response("Not Found", { status: 404 });
		}

		return new Response(object.body, {
			headers: {
				"Content-Type": "application/geo+json",
				"Cache-Control": "public, max-age=31536000, immutable",
				"Access-Control-Allow-Origin": allowedOrigin,
				Vary: "Origin",
			},
		});
	},
} satisfies ExportedHandler<Env>;
