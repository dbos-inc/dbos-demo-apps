import Home from './home-client'
import axios from 'axios';
import Product from '@/interfaces/Product';
import { cookies } from "next/headers";
import { getRequestCookie } from "@/lib/session";
import { backendAddress } from "@/lib/config";


const getProducts = async (): Promise<Product[]> => {
    try {
      const response = await axios.get(`${backendAddress}/api/products`);
      return response.data;
    } catch (error) {
      console.error(error);
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