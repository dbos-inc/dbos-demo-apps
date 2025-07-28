const HN_SEARCH_URL = "https://hn.algolia.com/api/v1/search";

export interface HackerNewsStory {
  objectID: string;
  title: string;
  url?: string;
  points: number;
  num_comments: number;
  author: string;
  created_at: string;
}

export interface HackerNewsComment {
  objectID: string;
  comment_text: string;
  author: string;
  created_at: string;
  story_id: string;
}

export const searchHackerNews = async (query: string, maxResults = 20): Promise<HackerNewsStory[]> => {
  try {
    const response = await fetch(`${HN_SEARCH_URL}?${new URLSearchParams({
      query,
      hitsPerPage: maxResults.toString(),
      tags: "story",
    })}`, { signal: AbortSignal.timeout(30000) });
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json() as { hits: HackerNewsStory[] };
    return data.hits ?? [];
  } catch (error) {
    console.error("Error searching Hacker News:", error);
    return [];
  }
};

export const getComments = async (storyId: string, maxComments = 50): Promise<HackerNewsComment[]> => {
  try {
    const response = await fetch(`${HN_SEARCH_URL}?${new URLSearchParams({
      tags: `comment,story_${storyId}`,
      hitsPerPage: maxComments.toString(),
    })}`, { signal: AbortSignal.timeout(30000) });
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json() as { hits: HackerNewsComment[] };
    return data.hits ?? [];
  } catch (error) {
    console.error("Error getting comments:", error);
    return [];
  }
};
