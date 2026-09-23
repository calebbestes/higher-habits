import {
  type InfiniteData,
  type QueryClient,
  infiniteQueryOptions,
  queryOptions,
} from "@tanstack/react-query";

import {
  type FriendFeedEntry,
  type FriendFeedPage,
  fetchMyPostsPage,
  fetchMyProfile,
} from "@/lib/friends-client";

export const MY_PROFILE_QUERY_KEY = ["my-profile"] as const;
export const MY_POSTS_QUERY_KEY = ["my-posts"] as const;

export function myProfileQueryOptions() {
  return queryOptions({
    queryKey: MY_PROFILE_QUERY_KEY,
    queryFn: fetchMyProfile,
    staleTime: 30_000,
  });
}

export function myPostsQueryOptions() {
  return infiniteQueryOptions({
    queryKey: MY_POSTS_QUERY_KEY,
    queryFn: ({ pageParam }) =>
      fetchMyPostsPage({
        cursor: pageParam,
        limit: 21,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

type MyPostsCache = InfiniteData<FriendFeedPage, unknown>;

export function flattenMyPosts(data: MyPostsCache | undefined) {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

export function getCachedMyPost(queryClient: QueryClient, postId: string) {
  return flattenMyPosts(
    queryClient.getQueryData<MyPostsCache>(MY_POSTS_QUERY_KEY),
  ).find((post) => post.id === postId);
}

export function getMyPostsNextCursor(data: MyPostsCache | undefined) {
  return data?.pages.at(-1)?.nextCursor ?? null;
}

export function appendMyPostsPage(
  queryClient: QueryClient,
  pageParam: string | null,
  page: FriendFeedPage,
) {
  queryClient.setQueryData<MyPostsCache>(MY_POSTS_QUERY_KEY, (data) => {
    if (!data) {
      return {
        pages: [page],
        pageParams: [pageParam],
      };
    }

    const existingIds = new Set(
      data.pages.flatMap((existingPage) =>
        existingPage.items.map((entry) => entry.id),
      ),
    );

    return {
      ...data,
      pages: [
        ...data.pages,
        {
          ...page,
          items: page.items.filter((entry) => !existingIds.has(entry.id)),
        },
      ],
      pageParams: [...data.pageParams, pageParam],
    };
  });
}

export function updateCachedMyPost(
  queryClient: QueryClient,
  post: FriendFeedEntry,
) {
  queryClient.setQueryData<MyPostsCache>(MY_POSTS_QUERY_KEY, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((entry) =>
              entry.id === post.id ? post : entry,
            ),
          })),
        }
      : data,
  );
}
