import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Automatically inject Authorization header if token exists
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('railvoice_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ----------------- Auth APIs -----------------
export const signupUser = async (userData) => {
  const resp = await apiClient.post('/auth/signup', userData);
  return resp.data;
};

export const loginUser = async (credentials) => {
  const resp = await apiClient.post('/auth/login', credentials);
  return resp.data;
};

export const getCurrentUser = async () => {
  const resp = await apiClient.get('/auth/me');
  return resp.data;
};

export const getHealth = async () => {
  const resp = await apiClient.get('/health');
  return resp.data;
};

export const getStations = async () => {
  const resp = await apiClient.get('/trains/stations');
  return resp.data.stations;
};

export const searchTrains = async (from, to, date, travelClass) => {
  const resp = await apiClient.get('/trains/search', {
    params: {
      from_station: from,
      to_station: to,
      date,
      travel_class: travelClass || undefined,
    },
  });
  return resp.data;
};

export const getTrainDetails = async (trainNumber) => {
  const resp = await apiClient.get(`/trains/${trainNumber}`);
  return resp.data;
};

export const createBooking = async (bookingData) => {
  const resp = await apiClient.post('/bookings', bookingData);
  return resp.data;
};

export const getAllBookings = async () => {
  const resp = await apiClient.get('/bookings');
  return resp.data.bookings;
};

export const getBookingByPnr = async (pnr) => {
  const resp = await apiClient.get(`/bookings/${pnr}`);
  return resp.data;
};

export const cancelBooking = async (pnr, reason) => {
  const resp = await apiClient.post('/bookings/cancel', { pnr, reason });
  return resp.data;
};

export const getPolicies = async () => {
  const resp = await apiClient.get('/policy');
  return resp.data;
};

export const queryPolicy = async (topic) => {
  const resp = await apiClient.get('/policy/query', { params: { topic } });
  return resp.data;
};
