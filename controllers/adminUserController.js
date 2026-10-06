const { deleteUserAccount, AccountError } = require('../services/accountService');

// ============================================
// Super admin: delete a user account
// DELETE /api/admin/users/:id
// Removes the user, their halal places, subscriptions and payments.
// Mosques added by the user are kept.
// ============================================
exports.deleteUser = async (req, res) => {
  const targetId = parseInt(req.params.id, 10);

  if (!Number.isInteger(targetId)) {
    return res.status(400).json({ message: 'Invalid user id' });
  }

  if (targetId === Number(req.user.id)) {
    return res.status(400).json({ message: 'You cannot delete your own account here' });
  }

  try {
    const summary = await deleteUserAccount(targetId);

    console.log(`Superadmin ${req.user.id} deleted user ${targetId}`, summary);

    res.json({
      message: 'User and related data deleted',
      deleted: summary
    });
  } catch (err) {
    if (err instanceof AccountError) {
      return res.status(err.status).json({ message: err.message });
    }
    console.error('admin deleteUser error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};