'use client'
import { Container, Row, Col, Card, Navbar, Nav, Button } from 'react-bootstrap';
import Product from '@/interfaces/Product';
import Image from 'next/image'
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import {backendAddress} from '@/lib/config';

interface HomeProps {
  products: Product[];
  user: String | null;
}

const Home: React.FC<HomeProps> = ({ products, user }) => {

  const router = useRouter();

  const handleLogout = async () => {
    await axios.post('/api/logout');
    router.push('/login');
  };

  
  const handleAddToCart = async (productId: number) => {
    if (user == null) {
      router.push('/login');
      return;
    }
  
    const bodyParams = {
      username: user,
      product_id: productId
    };
    
    try {
      await axios.post(`${backendAddress}/api/add_to_cart`, bodyParams);
    } catch (error) {
      console.error(error);
    }
  };
  

  return (
    <>
      <Navbar bg="dark" variant="dark" expand="lg" style={{ marginBottom: '20px' }}>
        <Navbar.Brand href="/" style={{ paddingLeft: '15px' }}>DBOS Shop Demo</Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="ml-auto">
          {user ? (
              <div style={{display: 'flex', flexDirection: 'row'}}>
                <Navbar.Text style={{ color: '#fff', fontSize: '1.25em', whiteSpace: 'nowrap', marginRight: '15px' }}>Hello, {user}</Navbar.Text>
                <Button variant="outline-light" onClick={handleLogout}>Logout</Button>
              </div>
            ) : (
              <Link href="/login" passHref>
                <Button variant="outline-light">Login</Button>
              </Link>
            )}
          </Nav>
        </Navbar.Collapse>
      </Navbar>

      <Container>
        <Row>
          {products.map((product: Product) => (
            <Col sm={12} md={6} lg={4} key={product.product_id}>
              <Card>
                <Image 
                  src={"/" + product.image_name}
                  width={1000}
                  height={300}
                  className="card-img-top" alt="..." />
                <Card.Body>
                  <Card.Title>{product.product}</Card.Title>
                  <Card.Text>
                    {product.description}
                  </Card.Text>
                  <Card.Text>
                    ${product.display_price}
                  </Card.Text>
                  <Button variant="primary" onClick={() => handleAddToCart(product.product_id)}>Add to Cart</Button>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
        <Link href="/checkout">
          <Button variant="success" className="mt-5">Proceed to Checkout</Button>
        </Link>
      </Container>
    </>
  );
};


export default Home;
