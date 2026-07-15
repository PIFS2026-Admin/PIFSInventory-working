export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY || "";

  if (!publicKey) {
    return Response.json(
      {
        configured: false,
        error: "TITAN push notifications are missing a VAPID public key.",
      },
      { status: 503 }
    );
  }

  if (!privateKey) {
    return Response.json(
      {
        configured: false,
        publicKey,
        error: "TITAN push delivery is missing VAPID_PRIVATE_KEY.",
      },
      { status: 503 }
    );
  }

  return Response.json({
    configured: true,
    publicKey,
  });
}
