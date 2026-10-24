ALTER TABLE "student_transport_allocations" ADD COLUMN "pickupStopId" TEXT;
CREATE TABLE "transport_stops" (
  "id" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "pickupTime" TEXT,
  "dropoffTime" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transport_stops_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "transport_stops_routeId_sequence_key" ON "transport_stops"("routeId", "sequence");
CREATE UNIQUE INDEX "transport_stops_routeId_name_key" ON "transport_stops"("routeId", "name");
ALTER TABLE "transport_stops" ADD CONSTRAINT "transport_stops_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transport_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_transport_allocations" ADD CONSTRAINT "student_transport_allocations_pickupStopId_fkey" FOREIGN KEY ("pickupStopId") REFERENCES "transport_stops"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "transport_vehicle_documents" (
  "id" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "documentNumber" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transport_vehicle_documents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "transport_vehicle_documents_vehicleId_expiresAt_idx" ON "transport_vehicle_documents"("vehicleId", "expiresAt");
ALTER TABLE "transport_vehicle_documents" ADD CONSTRAINT "transport_vehicle_documents_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "transport_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "transport_driver_assignments" (
  "id" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "driverName" TEXT NOT NULL,
  "driverPhone" TEXT NOT NULL,
  "licenseNumber" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "assignedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transport_driver_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "transport_driver_assignments_vehicleId_effectiveFrom_effectiveTo_idx" ON "transport_driver_assignments"("vehicleId", "effectiveFrom", "effectiveTo");
ALTER TABLE "transport_driver_assignments" ADD CONSTRAINT "transport_driver_assignments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "transport_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "transport_vehicle_tracking_logs" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "vehicleId" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "recordedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transport_vehicle_tracking_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "transport_vehicle_tracking_logs_institutionId_vehicleId_recordedAt_idx" ON "transport_vehicle_tracking_logs"("institutionId", "vehicleId", "recordedAt");
ALTER TABLE "transport_vehicle_tracking_logs" ADD CONSTRAINT "transport_vehicle_tracking_logs_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transport_vehicle_tracking_logs" ADD CONSTRAINT "transport_vehicle_tracking_logs_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "transport_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "transport_incidents" (
  "id" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "vehicleId" TEXT,
  "studentId" TEXT,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "recordedByUserId" TEXT NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "transport_incidents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "transport_incidents_institutionId_status_occurredAt_idx" ON "transport_incidents"("institutionId", "status", "occurredAt");
ALTER TABLE "transport_incidents" ADD CONSTRAINT "transport_incidents_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transport_incidents" ADD CONSTRAINT "transport_incidents_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "transport_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "transport_incidents" ADD CONSTRAINT "transport_incidents_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "transport_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transport_incidents" ADD CONSTRAINT "transport_incidents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "student_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
