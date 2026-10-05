#!/usr/bin/perl
# Patches the bundled web client's "skip segment" button (intro / credits):
#
#   - the button stays for the whole segment instead of fading after 8 seconds;
#   - when the credits run to the end of the file and another episode is queued, the button
#     is shown (stock hides it and waits for the "Next Up" card in the last 30 seconds),
#     reads "Next episode" and starts that episode.
#
# The web client ships minified, so each edit is an exact string replacement that must match
# exactly once; the build fails if the bundle ever changes shape.
#
# usage: patch-skip-segments.pl <jellyfin-web dir>
use strict;
use warnings;

my $dir = shift or die "usage: $0 <jellyfin-web dir>\n";
my $file = "$dir/main.jellyfin.bundle.js";

open(my $in, '<:raw', $file) or die "$file: $!\n";
my $js = do { local $/; <$in> };
close($in);

# "Credits that end the file, with something to play next", seen from `$self`.
sub ends_file {
    my ($self, $seg) = @_;
    return "$self.player&&$seg&&\"Outro\"===$seg.Type&&null!=$seg.EndTicks"
         . "&&$self.playbackManager.getNextItem()"
         . "&&$seg.EndTicks>=($self.playbackManager.currentItem($self.player).RunTimeTicks||0)-3e8";
}

my @edits = (
    # No fade-out timer.
    [ 'e.keep||(t.hideTimeout=setTimeout(t.hideSkipButton.bind(t),8e3))',
      'e.keep||(t.hideTimeout=null)' ],

    # Hiding the player controls no longer hides the button.
    [ ':this.hideTimeout||this.hideSkipButton())',
      ':0)' ],

    # Show the button for end-of-file credits too.
    [ 'this.player&&null!=t.EndTicks&&t.EndTicks>=this.playbackManager.currentItem(this.player).RunTimeTicks&&this.playbackManager.getNextItem()&&E.u1()||this.currentSegment||(',
      'this.currentSegment||(' ],

    # Pressing it on end-of-file credits starts the next episode.
    [ 'n<e.currentSegment.EndTicks-B.wi?e.playbackManager.seek(e.currentSegment.EndTicks):e.hideSkipButton()',
      ends_file('e', 'e.currentSegment') . '?(e.hideSkipButton(),e.playbackManager.nextTrack(e.player)):'
      . 'n<e.currentSegment.EndTicks-B.wi?e.playbackManager.seek(e.currentSegment.EndTicks):e.hideSkipButton()' ],

    # ...and it says so.
    [ 'this.skipElement.innerHTML=_.Ay.translate("MediaSegmentSkipPrompt",_.Ay.translate("MediaSegmentType.".concat(this.currentSegment.Type)))',
      'this.skipElement.innerHTML=(' . ends_file('this', 'this.currentSegment') . ')?_.Ay.translate("HeaderNextEpisode"):'
      . '_.Ay.translate("MediaSegmentSkipPrompt",_.Ay.translate("MediaSegmentType.".concat(this.currentSegment.Type)))' ],
);

for my $edit (@edits) {
    my ($from, $to) = @$edit;
    my $count = () = $js =~ /\Q$from\E/g;
    die "expected exactly one match, found $count: $from\n" unless $count == 1;
    $js =~ s/\Q$from\E/$to/;
}

open(my $out, '>:raw', $file) or die "$file: $!\n";
print $out $js;
close($out);
