const HN_SEARCH_URL = 'https://hn.algolia.com/api/v1/search';
const API_TIMEOUT = 30000;

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

export async function searchHackerNews(
  query: string,
  maxResults: number = 20
): Promise<HackerNewsStory[]> {
  const params = new URLSearchParams({
    query,
    hitsPerPage: maxResults.toString(),
    tags: 'story',
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch(`${HN_SEARCH_URL}?${params}`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: any = await response.json();
    return data.hits || [];
  } catch (error) {
    console.error('Error searching Hacker News:', error);
    return [];
  }
}

export async function getComments(
  storyId: string,
  maxComments: number = 50
): Promise<HackerNewsComment[]> {
  const params = new URLSearchParams({
    tags: `comment,story_${storyId}`,
    hitsPerPage: maxComments.toString(),
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    const response = await fetch(`${HN_SEARCH_URL}?${params}`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: any = await response.json();
    return data.hits || [];
  } catch (error) {
    console.error('Error getting comments:', error);
    return [];
  }
}

