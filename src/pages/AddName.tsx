import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { UserCircle2 } from 'lucide-react';

const AddName = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-2">
            <UserCircle2 className="w-9 h-9 text-primary" />
          </div>
          <CardTitle className="text-2xl">One more thing</CardTitle>
          <CardDescription>
            Please add your real Creator Name to your profile before continuing. This helps keep Lenory a trusted community.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => navigate('/profile?editProfile=true', { replace: true })}>
            Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AddName;
