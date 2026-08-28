import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import { Layout } from './components/layout';
import { AsaReviewPage } from './pages/asa-review-page';
import { DashboardPage } from './pages/dashboard-page';
import { DemonstrativeDetailPage } from './pages/demonstrative-detail-page';
import { SettingsPage } from './pages/settings-page';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'demonstratives/:id',
        element: <DemonstrativeDetailPage />,
      },
      {
        path: 'asa-review',
        element: <AsaReviewPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
