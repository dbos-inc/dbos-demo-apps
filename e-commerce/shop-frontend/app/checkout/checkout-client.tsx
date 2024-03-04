'use client'
import { Container, Table, Button, Row } from 'react-bootstrap';
import Link from 'next/link';
import { CartProduct, backendAddress } from '@/lib/backend';


interface CheckoutProps {
    cart: CartProduct[];
    username: string;
}

const Checkout: React.FC<CheckoutProps> = ({ cart, username }) => {

    const subtotal = (cart.reduce((total, product) => total + product.price * product.inventory, 0) / 100).toFixed(2);

    // this form redirects directly to the backend which then sends a redirect to the payment page.
    // Need to rework this to do return the payment URL from the handler and do the redirect on the client side

    const session_endpoint = `${backendAddress}/api/checkout_session?username=${username}`

    return (
        <Container className="mt-5">
            <h2>Your Shopping Cart</h2>
            <Table striped bordered hover>
            <thead>
                <tr>
                <th>Product Name</th>
                <th>Price</th>
                <th>Quantity</th>
                </tr>
            </thead>
            <tbody>
                {cart.map((product: CartProduct) => (
                <tr key={product.product_id}>
                    <td>{product.product}</td>
                    <td>${product.display_price}</td>
                    <td>{product.inventory}</td>
                </tr>
                ))}
            </tbody>
            </Table>
            <Row className="justify-content-end">
            <h3 className="mr-2">Subtotal: ${subtotal}</h3>
            </Row>
            <div className="text-right">
                <div className="btn-group">
                    <Link href="/" passHref>
                    <Button variant="secondary">Back to Home</Button>
                    </Link>
                    <form action={session_endpoint} method="POST">
                        <section>
                            <Button type="submit" role="link">
                            Proceed to Checkout
                            </Button>
                        </section>
                    </form>
                </div>
            </div>
        </Container>
    );
};
    
    

export default Checkout;