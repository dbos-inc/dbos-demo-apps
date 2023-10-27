import Checkout from './checkout-client'
import { CartProduct } from '@/interfaces/Product';
import { cookies } from "next/headers";
import { getRequestCookie } from "@/lib/session";
import { api } from '@/lib/backend';
import { redirect } from "next/navigation";
import { ResponseError } from '@/client';

const getCart = async (username: string): Promise<CartProduct[]> => {
    try {
        return await api.getCart({ getCartRequest: { username }});
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
    
    const username = await getRequestCookie(cookies());

    if (!username) {
        redirect("/login");
    }

    // Fetch data directly in a Server Component
    const cart = await getCart(username);
    // Forward fetched data to your Client Component
    return <Checkout cart={cart} username={username} />
  }