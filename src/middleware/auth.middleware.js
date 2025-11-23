export function authenticate(req, res, next) {
  const userId = req.header('x-user-id');
  const email = req.header('x-user-email');

  if (!userId) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  req.user = {
    id: userId,
    email
  };

  return next();
}
