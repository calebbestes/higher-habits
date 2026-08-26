import { GET as getFriendsFeed } from "@/app/api/friends/feed/route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ friendshipId: string }> },
) {
  const { friendshipId } = await params;
  const url = new URL(request.url);
  url.pathname = "/api/friends/feed";
  url.searchParams.set("friendshipId", friendshipId);
  url.searchParams.set("profilePosts", "1");

  return getFriendsFeed(new Request(url, request));
}
