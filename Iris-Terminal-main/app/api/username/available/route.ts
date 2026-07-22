export async function POST(request: Request) {
  const json = await request.json()
  const { username } = json as { username: string }

  if (!username) {
    return new Response(JSON.stringify({ message: "Username is required" }), {
      status: 400
    })
  }

  return new Response(JSON.stringify({ isAvailable: true }), {
    status: 200
  })
}
