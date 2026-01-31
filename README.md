# SubSentry - SaaS Spend Intelligence

An autonomous procurement & vendor negotiation assistant that helps finance teams identify waste in SaaS spend and negotiate renewals via email.

![SubSentry Dashboard](docs/dashboard-preview.png)

## Features

- **📤 CSV Import** - Upload QuickBooks, bank exports, or any CSV with transaction data
- **🔍 SaaS Detection** - Automatically identifies 80+ SaaS vendors from transaction descriptions
- **📅 Renewal Tracking** - Flags renewals within 30 days for proactive negotiation
- **🤖 AI-Powered Drafts** - Generate professional negotiation emails using Gemini, GPT, or Claude
- **✅ Human Approval Gate** - All outbound emails require explicit approval
- **💰 Savings Tracking** - Monitor estimated and confirmed savings from negotiations

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- API key for LLM provider (Gemini, OpenAI, or Anthropic)
- SMTP credentials (Gmail app password or other SMTP)

### Installation

```bash
# Clone the repository
cd SubSentry

# Install dependencies
npm install

# Copy environment file
cp .env.example .env.local

# Edit .env.local with your credentials
```

### Configure Environment

Edit `.env.local`:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/subsentry"

# NextAuth
NEXTAUTH_SECRET="generate-a-secure-random-string"
NEXTAUTH_URL="http://localhost:3000"

# LLM (choose one)
LLM_PROVIDER="gemini"  # or "openai" or "anthropic"
GEMINI_API_KEY="your-api-key"

# Email (Gmail example)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
```

### Initialize Database

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database
npx prisma db push
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Usage

### 1. Create Account
Register with your work email and password.

### 2. Upload Transactions
Drop a CSV file with your transaction data. The system will:
- Parse vendor names, amounts, and dates
- Detect recurring SaaS subscriptions
- Calculate renewal dates

### 3. Review Vendors
View detected vendors with:
- Monthly spend
- Renewal dates
- Urgency indicators (red/yellow/green)

### 4. Negotiate
Select a vendor and choose a strategy:
- **Seat Reduction** - Request fewer licenses
- **Tier Downgrade** - Move to a lower tier
- **Annual Prepay** - Offer upfront payment for discount

### 5. Review & Send
- Edit the AI-generated draft
- Enter recipient email
- Check the approval box
- Send!

### 6. Track Savings
Log confirmed savings after successful negotiations.

## Project Structure

```
SubSentry/
├── prisma/
│   └── schema.prisma       # Database models
├── samples/
│   └── sample-transactions.csv
├── src/
│   ├── app/
│   │   ├── api/            # API routes
│   │   │   ├── auth/       # Authentication
│   │   │   ├── dashboard/  # Dashboard metrics
│   │   │   ├── negotiate/  # Negotiation logic
│   │   │   ├── send-email/ # Email sending
│   │   │   ├── upload/     # CSV upload
│   │   │   └── vendors/    # Vendor management
│   │   ├── dashboard/      # Dashboard page
│   │   ├── login/          # Login page
│   │   ├── negotiate/      # Negotiation workflow
│   │   ├── negotiations/   # Negotiations list
│   │   ├── register/       # Registration page
│   │   └── vendors/        # Vendors list
│   ├── components/
│   │   ├── CSVUpload.tsx   # Drag-drop uploader
│   │   └── Navbar.tsx      # Navigation
│   └── lib/
│       ├── csv-parser.ts   # CSV parsing logic
│       ├── email.ts        # Email service
│       ├── llm.ts          # LLM integration
│       ├── prisma.ts       # Database client
│       ├── renewal-detection.ts
│       └── saas-vendors.ts # Vendor patterns
└── package.json
```

## Security

- ✅ Read-only data analysis
- ✅ No stored email passwords (env vars only)
- ✅ Human approval required for all emails
- ✅ Session-based authentication
- ✅ Input sanitization on all routes

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Connect repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Database

Use a managed PostgreSQL:
- Supabase
- Neon
- PlanetScale (MySQL mode)
- Railway

## Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: NextAuth.js
- **Email**: Nodemailer
- **LLM**: Gemini / GPT / Claude

## License

MIT
