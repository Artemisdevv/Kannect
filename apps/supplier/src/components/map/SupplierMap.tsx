import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

// Define types for supplier locations
type SupplierLocation = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  active: boolean;
};

type LocationPoint = {
  lat: number;
  lng: number;
};

// Helper to validate location data (similar to retailer approach)
const isValidLocation = (lat: number | null, lng: number | null): lat is number & lng is number => {
  return lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng);
};

// Fetch supplier locations - adjust endpoint as needed
const fetchSupplierLocations = async (): Promise<SupplierLocation[]> => {
  // Try to fetch from API - this would need to be implemented in backend
  try {
    const response = await fetch('/api/suppliers/locations');
    if (!response.ok) {
      // Fallback to demo data if API not available
      return getDemoLocations();
    }
    return await response.json();
  } catch (error) {
    console.warn('Failed to fetch supplier locations, using demo data:', error);
    return getDemoLocations();
  }
};

// Demo data for development - replace with real API when available
const getDemoLocations = (): SupplierLocation[] => [
  {
    id: '1',
    name: 'Main Warehouse',
    lat: 19.0760,
    lng: 72.8777,
    address: 'Mumbai, Maharashtra',
    active: true
  },
  {
    id: '2',
    name: 'Distribution Center',
    lat: 28.6139,
    lng: 77.2090,
    address: 'Delhi, Delhi',
    active: true
  },
  {
    id: '3',
    name: 'Southern Hub',
    lat: 12.9716,
    lng: 77.5946,
    address: 'Bangalore, Karnataka',
    active: true
  }
];

export const SupplierMap = () => {
  const { data: locations, isLoading, error } = useQuery({
    queryKey: ['supplierLocations'],
    queryFn: fetchSupplierLocations,
  });

  const [map, setMap] = useState<L.Map | null>(null);

  // Initialize map when component mounts
  useEffect(() => {
    if (!map) return;

    // Set initial view to show all markers if we have locations
    if (locations && locations.length > 0) {
      const validLocations = locations.filter(loc => 
        isValidLocation(loc.lat, loc.lng)
      );

      if (validLocations.length > 0) {
        const group = new L.featureGroup();
        validLocations.forEach(loc => {
          group.addLayer(L.marker([loc.lat, loc.lng]));
        });
        map.fitBounds(group.getBounds().pad(0.2));
      }
    }
  }, [map, locations]);

  if (isLoading) {
    return (
      <div className="flex h-64 w-full items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-error">
        <p>Failed to load map data</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-2 btn btn-sm btn-primary"
        >
          Retry
        </button>
      </div>
    );
  }

  // Filter out invalid locations
  const validLocations = locations?.filter(loc => 
    isValidLocation(loc.lat, loc.lng)
  ) || [];

  return (
    <MapContainer
      center={[20.5937, 78.9629]} // Default to India center
      zoom={5}
      whenCreated={setMap}
      style={{ height: '400px', width: '100%' }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {validLocations.map((location) => (
        <Marker
          key={location.id}
          position={[location.lat, location.lng]}
          // Optionally animate markers for active locations
          // This would require additional plugins or custom icons
        >
          <Popup>
            <div className="max-w-xs">
              <h3 className="font-bold">{location.name}</h3>
              {location.address && (
                <p className="text-sm text-muted-foreground">{location.address}</p>
              )}
              <span 
                className={`px-2 py-1 rounded-text ${location.active ? 'bg-success/20 text-success' : 'bg-muted/20 text-muted-foreground'}`}
              >
                {location.active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

// Import L from leaflet for map operations
declare const L: any;

export default SupplierMap;