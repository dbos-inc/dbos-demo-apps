import Home from './home-client'
import { Product } from '@/interfaces/Product';
import { cookies } from "next/headers";
import { getRequestCookie } from "@/lib/session";
import { api } from '@/lib/backend';
import { ResponseError } from '@/client';


const getProducts = async (): Promise<Product[]> => {
    try {
      return await api.getProducts();
    } catch (error) {
      if (error instanceof ResponseError) {
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