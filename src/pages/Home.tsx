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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-6 py-24">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gundam-red mb-4">{t('app.title')}</h1>

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
