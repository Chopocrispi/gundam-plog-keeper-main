import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import AuthDialog from '@/components/AuthDialog';

const Home: React.FC = () => {
  const { user, signedIn } = useAuth();
  const [showAuth, setShowAuth] = React.useState(false);
  const { t } = useTranslation();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (signedIn) {
      navigate('/app');
    }
  }, [signedIn, navigate]);

  return (
    <div className="min-h-screen bg-no-repeat bg-cover" style={{ backgroundImage: 'url(/Gunpla banner.webp)', backgroundColor: 'hsl(var(--sidebar-background))' }}>
      <div className="container mx-auto px-6 py-24 flex items-center justify-center">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-block rounded-md overflow-hidden border mb-4" style={{ borderColor: 'hsl(var(--border))' }}>
            <div className="px-4 py-3" style={{ background: 'hsl(var(--sidebar-primary))' }}>
              <span className="text-4xl sm:text-5xl font-extrabold tracking-wide" style={{ color: '#fff' }}>Gund</span>
              <span className="text-4xl sm:text-5xl font-extrabold tracking-wide" style={{ color: 'hsl(var(--gundam-yellow))' }}>app</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4">
            {!signedIn ? (
              <Button size="lg" onClick={() => setShowAuth(true)} className="bg-gradient-to-r from-primary to-gundam-red">Get started — Sign in</Button>
            ) : (
              <Link to="/app"><Button size="lg">Open my collection</Button></Link>
            )}
  <AuthDialog open={showAuth} onOpenChange={setShowAuth} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
