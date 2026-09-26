export default function handler(request) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      service: "AetherX Telegram Bot",
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    }
  );
}
