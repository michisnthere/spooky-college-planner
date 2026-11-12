# Tech Stack Guidelines

This project uses a minimal, lightweight backend stack chosen to prioritize simplicity and rapid development.

## Selected Stack: Node.js + Express + PostgreSQL

### Backend Runtime & Framework
- **Node.js**: JavaScript runtime for server-side logic
- **Express.js**: Minimal web framework for REST API endpoints
- **npm**: Package manager for dependencies

### Database
- **PostgreSQL**: Robust relational database for storing college data and user application tracking
- **Connection pooling**: Use pg-pool for efficient database connections

### External APIs
- **U.S. College Scorecard API**: For auto-filling college lookup data (location, state, acceptance rate)

### Development & Deployment
- **Environment Management**: dotenv for configuration
- **CORS**: Enable CORS for frontend communication
- **Logging**: Use console or simple logger for debugging

## Architecture Principles
1. Stateless API design for easy scaling
2. JSON request/response format
3. Standard REST conventions for routes
4. Minimal dependencies to reduce complexity and maintenance

## Database Schema Focus
- Students table (user data)
- Colleges table (college information from Scorecard API)
- Applications table (tracking user application status and deadlines)
- Deadlines table (managing application timelines)
