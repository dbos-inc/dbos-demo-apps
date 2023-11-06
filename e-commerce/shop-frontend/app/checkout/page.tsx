import Checkout from './checkout-client'
import { cookies } from "next/headers";
import { getRequestCookie } from "@/lib/session";
import { api, CartProduct } from '@/lib/backend';
import { redirect } from "next/navigation";
import { HttpError, ok } from 'oazapfts';

const getCart = async (username: string): Promise<CartProduct[]> => {
    try {
        return await ok(api.getCart({ username }));
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
    
    const username = await getRequestCookie(cookies());

    if (!username) {
        redirect("/login");
    }

    // Fetch data directly in a Server Component
    const cart = await getCart(username);
    // Forward fetched data to your Client Component
    return <Checkout cart={cart} username={username} />
  }