import { withAuth } from 'next-auth/middleware';

export default withAuth({
    pages: {
        signIn: '/login',
    },
});

export const config = {
    matcher: ['/dashboard/:path*', '/vendors/:path*', '/negotiate/:path*', '/negotiations/:path*', '/subscriptions/:path*'],
};
