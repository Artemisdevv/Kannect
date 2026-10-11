# Retailer-Side Supplier Delivery Map Implementation Plan

## Overview
This plan outlines the implementation of a retailer-side supplier delivery map feature in Kannect. The feature will allow retailers to view real-time delivery locations on a map when viewing supplier orders, showing route visualization, order status, tracking timeline, and ETA.

## Current State Analysis

### Backend
- **Models**: SupplierOrder, Shop, Supplier already have location fields (Geometry POINT)
- **Tracking**: OrderTracking model exists for status updates with timestamps
- **Missing**: No model for storing real-time GPS location updates from suppliers
- **API**: Existing endpoints for order management, but no location update endpoints

### Frontend (Retailer App)
- **Order List**: Displays supplier orders with basic status
- **Order Detail**: Shows order information, status, and tracking history
- **Maps**: Leaflet is already installed and used elsewhere in the app
- **Missing**: Map component in order detail view for delivery tracking

### Documentation
- **OpenAPI**: Defines existing API contracts
- **API Contract**: Documents current API behavior
- **Apps.md**: Describes retailer and supplier app structures

## Dependencies & Prerequisites

### Confirmed Facts
1. Backend uses SQLAlchemy with GeoAlchemy2 for spatial data types
2. Supplier and Shop models already have `location` fields (Geometry POINT)
3. OrderTracking model exists for status history
4. Retailer app uses React/Vite with Leaflet for mapping
5. Authentication is JWT-based with role validation
6. Existing order detail dialog can be extended

### Assumptions (To Be Verified)
1. Supplier app can be modified to send location updates (out of scope for retailer-side but needed for testing)
2. Backend can receive and store GPS location updates
3. Map provider (Leaflet) supports real-time marker updates
4. Retailer has permission to view supplier location for their orders

## Implementation Plan

### Phase 1: Backend Foundation
**Dependencies**: None
**Files to Modify**:
1. `backend/app/models/domain.py` - Add OrderLocationUpdate model
2. `backend/app/schemas/order.py` - Add location update schemas
3. `backend/app/api/orders.py` - Add location update endpoints
4. `backend/app/core/security.py` - Add order access validation
5. `docs/openapi.yaml` - Add location update API specifications

**Acceptance Criteria**:
- [ ] OrderLocationUpdate model stores latitude, longitude, accuracy, timestamps
- [ ] Supplier can POST location updates for orders they're fulfilling
- [ ] Retailer can GET location updates for orders they placed
- [ ] Proper authorization prevents unauthorized access
- [ ] API responses match OpenAPI specification
- [ ] Database migrations created for new model

**Validation Steps**:
1. Run backend tests to ensure no regressions
2. Test location update endpoint with supplier credentials
3. Test location retrieval endpoint with retailer credentials
4. Verify unauthorized access returns 403/404
5. Check OpenAPI docs reflect new endpoints

**Blockers**:
- None identified at this stage

### Phase 2: Backend Enhancements
**Dependencies**: Phase 1 complete
**Files to Modify**:
1. `backend/app/models/domain.py` - Add relationship to SupplierOrder
2. `backend/app/api/orders.py` - Add filtering and pagination for location updates
3. `backend/app/services/order_service.py` - Add business logic for location processing
4. `docs/api-contract.md` - Document location update behavior

**Acceptance Criteria**:
- [ ] SupplierOrder model has relationship to location updates
- [ ] Endpoints support filtering by time range and pagination
- [ ] Service layer handles location data validation
- [ ] Stale location detection (configurable timeout)
- [ ] API contract updated with new behavior

**Validation Steps**:
1. Test time-range filtering on location updates
2. Verify pagination works correctly
3. Test stale location detection logic
4. Ensure relationship loading works in queries
5. Validate API contract documentation

**Blockers**:
- Need to define stale location threshold (e.g., 5 minutes)

### Phase 3: Retailer Frontend - Basic Map
**Dependencies**: Phase 1 & 2 complete
**Files to Modify**:
1. `apps/retailer/src/features/orders/order-detail.tsx` - Add map container
2. `apps/retailer/src/components/DeliveryMap.tsx` - New map component
3. `apps/retailer/src/hooks/useOrderLocation.ts` - New hook for location data
4. `apps/retailer/src/lib/map-utils.ts` - Map helper functions

**Acceptance Criteria**:
- [ ] Order detail view shows map when order is dispatched/delivered
- [ ] Map displays supplier origin and retailer destination markers
- [ ] Route line drawn between origin and destination
- [ ] Current location marker shown when available
- [ ] Loading and error states handled
- [ ] Map responsive on mobile devices

**Validation Steps**:
1. Verify map renders with test data
2. Check origin/destination markers appear correctly
3. Verify route line connects points
4. Test mobile responsiveness
5. Confirm loading/error states work

**Blockers**:
- Need map API key if using external services (Leaflet is free)
- Need to confirm order statuses that should show map

### Phase 4: Retailer Frontend - Live Tracking
**Dependencies**: Phase 3 complete
**Files to Modify**:
1. `apps/retailer/src/hooks/useOrderLocation.ts` - Add WebSocket/polling logic
2. `apps/retailer/src/components/DeliveryMap.tsx` - Add real-time marker updates
3. `apps/retailer/src/components/TrackingTimeline.tsx` - Enhance with live data
4. `apps/retailer/src/lib/location-utils.ts` - Stale location handling

**Acceptance Criteria**:
- [ ] Location marker moves in real-time as updates arrive
- [ ] Tracking timeline shows recent location history
- [ ] ETA calculated and displayed when available
- [ ] Stale locations indicated visually (different marker/style)
- [ ] Connection recovery handled gracefully
- [ ] Battery-efficient updates on mobile

**Validation Steps**:
1. Test real-time marker movement with simulated updates
2. Verify timeline updates with new location data
3. Check ETA calculation and display
4. Confirm stale location visualization
5. Test connection loss and recovery scenarios

**Blockers**:
- Need to decide polling interval vs WebSocket
- Need ETA calculation method (supplier-provided or estimated)

### Phase 5: Integration & Testing
**Dependencies**: All previous phases complete
**Files to Modify**:
1. `apps/retailer/src/features/orders/orders-page.tsx` - Update order list to indicate trackable orders
2. `backend/tests/test_order_location.py` - Backend test suite
3. `apps/retailer/tests/delivery-map.test.tsx` - Frontend test suite
4. `docs/apps.md` - Update retailer app documentation

**Acceptance Criteria**:
- [ ] Order list shows tracking indicator for orders with location updates
- [ ] Full end-to-end flow works with test data
- [ ] All unit and integration tests pass
- [ ] Documentation reflects new functionality
- [ ] Performance acceptable on target devices

**Validation Steps**:
1. Run full test suite for backend and frontend
2. Perform manual end-to-end testing
3. Verify performance on mobile devices
4. Check documentation accuracy
5. Validate accessibility compliance

**Blockers**:
- Test data setup for location updates
- Mobile performance considerations

## API Contract Changes

### New Endpoints
```
POST /orders/{order_id}/location
  - Supplier updates delivery location
  - Requires supplier authentication for this order
  - Body: { latitude, longitude, accuracy? }

GET /orders/{order_id}/location
  - Retailer gets location updates for their order
  - Requires retailer authentication for this order
  - Query: start_time?, end_time?, limit?, offset?
  - Returns: Array of location updates with timestamps
```

### Modified Existing Endpoints
```
GET /orders/{order_id}
  - Now includes: has_location_updates (boolean), latest_location (object)
```

## Data Model Changes

### New Model: OrderLocationUpdate
- id: UUID (primary key)
- order_id: UUID (foreign key to order)
- latitude: Float (required)
- longitude: Float (required)
- accuracy: Float? (GPS accuracy in meters)
- recorded_at: DateTime (when GPS recorded)
- received_at: DateTime (when server received)
- Relationship: belongs_to SupplierOrder

### Modified Model: SupplierOrder
- Added relationship: location_updates (OneToMany)

## Security Considerations
1. Suppliers can only update locations for their own orders
2. Retailers can only view locations for orders they placed
3. Location data validated for reasonable coordinates
4. Rate limiting on location update endpoints
5. No PII exposed in location data

## Map Provider Requirements
1. Leaflet already installed - no new dependencies
2. Use OpenStreetMap tiles (free) or configure provider via env vars
3. Support for custom markers (truck, origin, destination)
4. Polyline for route visualization
5. Popup/tooltip for location details

## Mobile UX Considerations
1. Map takes full width on mobile order detail
2. Touch-friendly controls (zoom, pan)
3. Collapsible tracking timeline
4. Battery-conscious update frequency
5. Offline fallback to last known location

## Acceptance Criteria (Overall)
1. Retailer can see supplier origin, retailer destination on map
2. Route is visualized between origin and destination
3. Current delivery location shown when available
4. Location updates animate smoothly in real-time
5. Tracking timeline shows location history with timestamps
6. ETA displayed when available from tracking data
7. Stale locations visually differentiated
8. Proper error handling for missing/unauthorized data
9. Mobile-responsive design works on iOS/Android
10. All existing functionality preserved

## Validation Steps Summary
1. Backend API tests for location endpoints
2. Frontend unit tests for map and hooks
3. Integration tests for order detail flow
4. Manual QA with simulated location updates
5. Performance testing on mobile devices
6. Security testing for authorization boundaries
7. Documentation verification

## Estimated Effort
- Phase 1: 2 days (backend foundation)
- Phase 2: 1 day (backend enhancements)
- Phase 3: 2 days (frontend basic map)
- Phase 4: 2 days (frontend live tracking)
- Phase 5: 1 day (integration & testing)
- Total: 8 days

## Open Questions
1. What is the threshold for considering location data stale?
2. Should ETA come from supplier updates or be calculated?
3. What map tile provider should be used in production?
4. Should we use WebSocket or polling for real-time updates?
5. How frequently should suppliers send location updates?