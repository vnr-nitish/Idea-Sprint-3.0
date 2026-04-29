# Idea Sprint 3.0

A full-stack hackathon operations portal built for managing registrations, member workflows, SPOC coordination, and admin operations.

## Overview

Idea Sprint 3.0 is a role-based web application designed to run a hackathon end to end. It includes a public event site, team registration, secure login, and separate dashboards for members, SPOCs, and admins.

The project is built with:
- Next.js 15.1.3
- React 19
- TypeScript 5.7.3
- Tailwind CSS 3.4.17
- Supabase 2.93.3

## Scale

- 36 page routes
- 4 API routes
- 12 shared library modules
- 3 major user roles
- Supabase-first architecture with localStorage fallback

## Main Features

- Public hackathon landing page
- Team registration and member signup
- Member and SPOC login flows
- Role-based dashboards
- Attendance tracking with Supabase persistence
- Reporting and venue assignment
- Food coupon management
- NOC workflow
- PPT workflow
- Problem statement management
- ID card and certificate management
- Team profile management
- Admin tools for operations and oversight

## User Roles

### Public User
- Views event details
- Registers a team
- Accesses login and registration pages

### Member
- Uses personal dashboard
- Views assigned tasks and workflows
- Handles profile-related operations

### SPOC
- Manages team-level coordination
- Works with reporting, food, NOC, PPT, and profile pages

### Admin
- Oversees all teams and workflows
- Manages attendance
- Controls reporting assignments
- Handles operational and moderation tasks

## Architecture

The app uses Supabase as the primary source of truth for persisted data. LocalStorage is used as a fallback so the app still works if backend access is unavailable.

The backend is split into focused modules for:
- team/session handling
- reporting
- food coupons
- NOC
- PPT
- problem statements
- ID cards and certificates
- attendance
- SPOC session handling

## What I Built

I built a complete hackathon management system that supports:
- event presentation
- registration and authentication
- structured role-based access
- operational workflows for organizers
- persistent backend data storage
- admin and SPOC coordination tools

## Getting Started

```bash
npm install
npm run dev
