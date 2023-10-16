'use client'

import React from 'react';
import { Alert, Container, Button } from 'react-bootstrap';
import Link from 'next/link';

const Success = () => (
  <Container className="mt-5">
    <Alert variant="success">
      <Alert.Heading>Payment Successful!</Alert.Heading>
      <p>Your payment was processed successfully. Thank you for your purchase!</p>
    </Alert>
    <Link href="/" passHref>
      <Button variant="primary">Return Home</Button>
    </Link>
  </Container>
);

export default Success;