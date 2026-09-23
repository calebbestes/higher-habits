import {
  type InfiniteData,
  type QueryClient,
  infiniteQueryOptions,
} from "@tanstack/react-query";

import {
  type FriendFeedEntry,
  type FriendFeedPage,
  fetchFriendsFeed,
} from "@/lib/friends-client";

export const FRIENDS_FEED_PAGE_SIZE = 10;
export const FRIENDS_FEED_QUERY_KEY = ["friends-feed"] as const;

export function friendsFeedQueryOptions() {
  return infiniteQueryOptions({
    queryKey: FRIENDS_FEED_QUERY_KEY,
    queryFn: ({ pageParam }) =>
      fetchFriendsFeed({
        cursor: pageParam,
        limit: FRIENDS_FEED_PAGE_SIZE,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}

type FriendsFeedCache = InfiniteData<FriendFeedPage, unknown>;

export function flattenFriendsFeed(data: FriendsFeedCache | undefined) {
  return data?.pages.flatMap((page) => page.items) ?? [];
}

export function getFriendsFeedNextCursor(data: FriendsFeedCache | undefined) {
  return data?.pages.at(-1)?.nextCursor ?? null;
}

export function getCachedFriendsFeedEntry(
  queryClient: QueryClient,
  postId: string,
): FriendFeedEntry | null {
  const data = queryClient.getQueryData<FriendsFeedCache>(
    FRIENDS_FEED_QUERY_KEY,
  );
  return flattenFriendsFeed(data).find((entry) => entry.id === postId) ?? null;
}

export function updateCachedFriendsFeedEntries(
  queryClient: QueryClient,
  updater: (entries: FriendFeedEntry[]) => FriendFeedEntry[],
) {
  queryClient.setQueryData<FriendsFeedCache>(FRIENDS_FEED_QUERY_KEY, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: updater(page.items),
          })),
        }
      : data,
  );
}

export function appendFriendsFeedPage(
  queryClient: QueryClient,
  pageParam: string | null,
  page: FriendFeedPage,
) {
  queryClient.setQueryData<FriendsFeedCache>(FRIENDS_FEED_QUERY_KEY, (data) => {
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
    const nextItems = page.items.filter((entry) => !existingIds.has(entry.id));

    return {
      ...data,
      pages: [
        ...data.pages,
        {
          ...page,
          items: nextItems,
        },
      ],
      pageParams: [...data.pageParams, pageParam],
    };
  });
}
