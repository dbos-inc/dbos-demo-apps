import Checkout from './checkout-client'
import axios from 'axios';
import Product from '@/interfaces/Product';
import { cookies } from "next/headers";
import { getRequestCookie } from "@/lib/session";
import { backendAddress } from "@/lib/config";
import { redirect } from "next/navigation";

const getCart = async (username: String): Promise<Product[]> => {
    try {
        const bodyParams = {
            username: username
        }
        const response = await axios.post(`${backendAddress}/api/get_cart`, bodyParams);
        return response.data;
    } catch (error) {
        console.error(error);
        return [];
    }
  }

  export default async function Page() {
    
    const username = await getRequestCookie(cookies());

    if (!username) {
        redirect("/login");
    }

    // Fetch data directly in a Server Component
    const cart = await getCart(username);
    // Forward fetched data to your Client Component
    return <Checkout cart={cart} username={username} />
  }