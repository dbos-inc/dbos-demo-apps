import Home from './home-client'
import { cookies } from "next/headers";
import { getRequestCookie } from "@/lib/session";
import { api, Product } from '@/lib/backend';
import { HttpError, ok } from 'oazapfts';


const getProducts = async (): Promise<Product[]> => {
    try {
      return await ok(api.getProducts());
    } catch (error) {
      if (error instanceof HttpError) {
          console.error(error.message);
      } else {
          console.error(error);
      }
      return [];
    }
  }

  export default async function Page() {
    
    const user = await getRequestCookie(cookies());
    // Fetch data directly in a Server Component
    const products = await getProducts();
    // Forward fetched data to your Client Component
    return <Home products={products} user={user} />
  }