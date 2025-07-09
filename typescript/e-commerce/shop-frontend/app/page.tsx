import Home from './home-client'
import { cookies } from "next/headers";
import { api, Product } from '@/lib/backend';
import { redirect } from "next/navigation";
import { HttpError, ok } from 'oazapfts';
import { getIronSession } from 'iron-session';
import { sessionOptions, User } from '@/lib/session';


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
    const session = await getIronSession<{user?: User}>(cookies(), sessionOptions);
    const user = session.user?.username;
    if (!user) {
        redirect("/login");
    }
    // Fetch data directly in a Server Component
    const products = await getProducts();
    // Forward fetched data to your Client Component
    return <Home products={products} user={user} />
  }