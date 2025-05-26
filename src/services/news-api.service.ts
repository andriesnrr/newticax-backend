import axios from 'axios';
import slugify from 'slugify';
import { prisma } from '../config/db';
import { env } from '../config/env';
import { Language } from '@prisma/client';

interface NewsAPIParams {
  q?: string;
  category?: string;
  country?: string;
  language?: string;
  sources?: string;
  domains?: string;
  from?: string;
  to?: string;
  pageSize?: number;
  page?: number;
}

interface NewsAPIArticle {
  source: {
    id: string | null;
    name: string;
  };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  content: string | null;
}

interface NewsAPIResponse {
  status: string;
  totalResults: number;
  articles: NewsAPIArticle[];
}

// Function to fetch articles from NewsAPI
export const fetchArticlesFromNewsAPI = async (params: NewsAPIParams): Promise<any[]> => {
  try {
    // Check if we have cached response
    const cacheKey = JSON.stringify(params);
    const cache = await prisma.newsApiCache.findFirst({
      where: {
        endpoint: 'everything',
        params: cacheKey,
        language: params.language === 'id' ? Language.INDONESIAN : Language.ENGLISH,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (cache) {
      return JSON.parse(cache.data);
    }

    // Make request to NewsAPI
    const response = await axios.get(`${env.NEWS_API_BASE_URL}/everything`, {
      params: {
        ...params,
        apiKey: env.NEWS_API_KEY,
      },
    });

    const { articles } = response.data as NewsAPIResponse;

    // Format articles
    const formattedArticles = articles.map(article => {
      const slug = slugify(article.title, { lower: true, strict: true }) || Date.now().toString();
      
      return {
        id: `ext-${Buffer.from(article.url).toString('base64').substring(0, 20)}`,
        title: article.title,
        slug,
        content: article.content || article.description || '',
        summary: article.description || '',
        image: article.urlToImage,
        source: article.source.name,
        sourceUrl: article.url,
        externalId: article.url,
        isExternal: true,
        publishedAt: new Date(article.publishedAt),
        createdAt: new Date(),
        author: article.author ? { name: article.author } : null,
        viewCount: 0,
        shareCount: 0,
      };
    });

    // Cache response for 30 minutes
    await prisma.newsApiCache.create({
      data: {
        endpoint: 'everything',
        params: cacheKey,
        data: JSON.stringify(formattedArticles),
        language: params.language === 'id' ? Language.INDONESIAN : Language.ENGLISH,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
      },
    });

    return formattedArticles;
  } catch (error) {
    console.error('Error fetching articles from NewsAPI:', error);
    return [];
  }
};

// Function to sync news from external API and save to database
export const syncNewsFromAPI = async (categories: string[] = ['general'], language: Language = Language.ENGLISH): Promise<any> => {
  try {
    let totalSynced = 0;
    const errors: string[] = [];
    
    // Map for language code
    const languageCode = language === Language.INDONESIAN ? 'id' : 'en';
    
    // Process each category
    for (const category of categories) {
      try {
        // Fetch articles
        const response = await axios.get(`${env.NEWS_API_BASE_URL}/top-headlines`, {
          params: {
            category,
            language: languageCode,
            pageSize: 10,
            apiKey: env.NEWS_API_KEY,
          },
        });

        const { articles } = response.data as NewsAPIResponse;

        // Get or create category
        let categoryRecord = await prisma.category.findFirst({
          where: {
            slug: category,
          },
        });

        if (!categoryRecord) {
          categoryRecord = await prisma.category.create({
            data: {
              name: category.charAt(0).toUpperCase() + category.slice(1),
              slug: category,
              description: `${category.charAt(0).toUpperCase() + category.slice(1)} news category`,
            },
          });
        }

        // Process and save articles
        for (const article of articles) {
          try {
            const existingArticle = await prisma.article.findFirst({
              where: {
                OR: [
                  { sourceUrl: article.url },
                  { title: article.title },
                ],
                language,
              },
            });

            if (!existingArticle) {
              const slug = slugify(article.title, { lower: true, strict: true }) || Date.now().toString();

              await prisma.article.create({
                data: {
                  title: article.title,
                  slug,
                  content: article.content || article.description || '',
                  summary: article.description || '',
                  image: article.urlToImage,
                  source: article.source.name,
                  sourceUrl: article.url,
                  externalId: article.url,
                  isExternal: true,
                  categoryId: categoryRecord.id,
                  language,
                  publishedAt: new Date(article.publishedAt),
                },
              });

              totalSynced++;
            }
          } catch (articleError) {
            console.error('Error syncing article:', articleError);
            errors.push(`Error syncing article: ${article.title} - ${(articleError as Error).message}`);
          }
        }
      } catch (categoryError) {
        console.error('Error syncing category:', categoryError);
        errors.push(`Error syncing category: ${category} - ${(categoryError as Error).message}`);
      }
    }

    return {
      totalSynced,
      errors: errors.length > 0 ? errors : null,
    };
  } catch (error) {
    console.error('Error syncing news from API:', error);
    throw error;
  }
};

// Function to start periodic news fetching
export const startNewsAPIFetcher = () => {
  // Sync news every 3 hours
  const syncNews = async () => {
    try {
      console.log('Syncing news from NewsAPI...');
      
      // Sync English news
      await syncNewsFromAPI(['general', 'business', 'technology', 'sports', 'entertainment', 'health', 'science'], Language.ENGLISH);
      
      // Sync Indonesian news
      await syncNewsFromAPI(['general', 'business', 'technology', 'sports', 'entertainment', 'health', 'science'], Language.INDONESIAN);
      
      console.log('News sync completed');
    } catch (error) {
      console.error('News sync error:', error);
    }
  };

  // Run immediately on startup
  syncNews();

  // Then schedule to run every 3 hours
  setInterval(syncNews, 3 * 60 * 60 * 1000);
};
