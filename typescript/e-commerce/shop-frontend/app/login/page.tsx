'use client'
import { useForm } from 'react-hook-form';
import axios from 'axios';
import { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { useRouter } from 'next/navigation';

interface LoginFormInputs {
  username: string;
  password: string;
}

export default function AuthPage() {

  const router = useRouter();

  const {
    register: loginRegister,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors },
  } = useForm<LoginFormInputs>();

  const {
    register: registerRegister,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors },
  } = useForm<LoginFormInputs>();

  const [loginError, setLoginError] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);

  const onLogin = async (data: LoginFormInputs) => {
    try {
      await axios.post('/api/login', data);
      router.push('/');
    } catch (error) { // If the response code isn't 200-range, Axios throws an error.
      if (error instanceof axios.AxiosError && error.response) {
        setLoginError(error.response.data.message)
      } else {
        setLoginError('An error occurred. Please try again.');
      }
    }
  };

  const onRegister = async (data: LoginFormInputs) => {
    try {
      await axios.post('/api/register', data);
      setRegisterError("Registration successful!")
    } catch (error) { // If the response code isn't 200-range, Axios throws an error.
      if (error instanceof axios.AxiosError && error.response) {
        setRegisterError(error.response.data.message)
      } else {
        setRegisterError('An error occurred. Please try again.');
      }
    }
  };

  return (
    <div className="container mt-5">
      <div className="row">
        <div className="col-sm-6">
          <h2>Login</h2>
          <form onSubmit={handleLoginSubmit(onLogin)} className="mb-3">
            <div className="mb-3">
              <input className="form-control" {...loginRegister('username')} placeholder="Username" />
              {loginErrors.username && <p>This field is required</p>}
            </div>

            <div className="mb-3">
              <input className="form-control" {...loginRegister('password')} placeholder="Password" type="password" />
              {loginErrors.password && <p>This field is required</p>}
            </div>

            <button className="btn btn-primary" type="submit">Login</button>
          </form>
          {loginError && <div className="alert alert-danger">{loginError}</div>}
        </div>
        <div className="col-sm-6">
          <h2>Register</h2>
          <form onSubmit={handleRegisterSubmit(onRegister)} className="mb-3">
            <div className="mb-3">
              <input className="form-control" {...registerRegister('username')} placeholder="Username" />
              {registerErrors.username && <p>This field is required</p>}
            </div>

            <div className="mb-3">
              <input className="form-control" {...registerRegister('password')} placeholder="Password" type="password" />
              {registerErrors.password && <p>This field is required</p>}
            </div>

            <button className="btn btn-primary" type="submit">Register</button>
          </form>
          {registerError && <div className="alert alert-danger">{registerError}</div>}
        </div>
      </div>
    </div>
  );
}
