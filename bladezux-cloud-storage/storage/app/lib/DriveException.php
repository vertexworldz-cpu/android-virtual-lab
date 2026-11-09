<?php
declare(strict_types=1);

namespace Bladezux;

/** Google Drive / OAuth failure carrying a user-safe message. */
final class DriveException extends \RuntimeException
{
    public function __construct(
        string $userMessage,
        public readonly int $httpStatus = 502,
        public readonly string $reason = 'drive_error',
        ?\Throwable $previous = null
    ) {
        parent::__construct($userMessage, 0, $previous);
    }
}
