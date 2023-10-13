'use client'

import React from 'react';
import { Alert, Container, Button } from 'react-bootstrap';
import Link from 'next/link';

const Cancel = () => (
  <Container className="mt-5">
    <Alert variant="danger">
      <Alert.Heading>Payment Failed</Alert.Heading>
      <p>Unfortunately, your payment failed. Please try again.</p>
    </Alert>
    <Link href="/" passHref>
      <Button variant="primary">Return Home</Button>
    </Link>
  </Container>
);

export default Cancel;