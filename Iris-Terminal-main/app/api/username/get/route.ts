import { LOCAL_USERNAME } from "@/lib/local-config"

export async function POST() {
  return new Response(JSON.stringify({ username: LOCAL_USERNAME }), {
    status: 200
  })
}
