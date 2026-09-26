export default function handler(request) {
  return new Response(
    JSON.stringify({ ok: true, service: "AetherX Telegram Bot" }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
